const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const index = fs.readFileSync('index.html', 'utf8');

// Extract loadFirestorePage from index.html
const m = index.match(/async function loadFirestorePage\(key, page = 1, options = \{\}\) \{([\s\S]*?)\n\}/);
assert.ok(m, 'loadFirestorePage must exist in index.html');

function createSandbox(initialState = {}) {
  const sandbox = {
    STORAGE_MODE: 'supabase',
    currentUser: { id: 'test-user', uid: 'test-user' },
    SERVER_PAGED_KEYS: new Set(['visitsClinic', 'visitsDental', 'income', 'expense']),
    PAGE_SIZE: 3,
    DB: { visitsClinic: [] },
    PAGE_DATA_LOADED_AT: {},
    FIRESTORE_PAGE_ERRORS: {},
    PENDING_UPSERT_IDS: new Map(),
    RLS_FAILED_IDS: new Map(),
    getPendingIdsForKey(key) {
      if (!sandbox.PENDING_UPSERT_IDS.has(key)) sandbox.PENDING_UPSERT_IDS.set(key, new Set());
      return sandbox.PENDING_UPSERT_IDS.get(key);
    },
    getRlsFailedIdsForKey(key) {
      if (!sandbox.RLS_FAILED_IDS.has(key)) sandbox.RLS_FAILED_IDS.set(key, new Set());
      return sandbox.RLS_FAILED_IDS.get(key);
    },
    _pageState: {
      currentPage: 1,
      cursors: { 1: null },
      pages: {},
      hasMore: {},
      querySignature: ''
    },
    getFirestorePageState(key) { return sandbox._pageState; },
    pageQueryOptions(key, page) {
      return sandbox._currentQueryOptions || { where: [{ field: 'date', op: '>=', value: '2026-10-01' }, { field: 'date', op: '<=', value: '2026-10-31' }] };
    },
    window: {
      MitaliSupabase: {
        getPage: async (key, opts) => {
          return sandbox._mockServerPages[opts.page || 1] || { records: [], hasMore: false };
        }
      }
    },
    console: { log() {}, warn() {}, error() {} }
  };

  Object.assign(sandbox, initialState);
  vm.createContext(sandbox);
  vm.runInContext(m[0] + '\nthis.loadFirestorePage = loadFirestorePage;', sandbox);
  return sandbox;
}

async function runTests() {
  console.log('Running behavioral tests for pagination & filters (P0-4 simulation)...');

  // Test 1: Page 2 must return strictly page 2 records [4, 5, 6] without prepending local records [1, 2, 3]
  {
    const sb = createSandbox({
      _mockServerPages: {
        1: { records: [{ id: '1', date: '2026-10-01' }, { id: '2', date: '2026-10-02' }, { id: '3', date: '2026-10-03' }], hasMore: true },
        2: { records: [{ id: '4', date: '2026-10-04' }, { id: '5', date: '2026-10-05' }, { id: '6', date: '2026-10-06' }], hasMore: false }
      }
    });

    // Load page 1
    await sb.loadFirestorePage('visitsClinic', 1);
    assert.deepEqual(sb.DB.visitsClinic.map(r => r.id), ['1', '2', '3']);

    // Load page 2 (with local cache holding 1, 2, 3)
    await sb.loadFirestorePage('visitsClinic', 2);
    // Page 2 must ONLY have records 4, 5, 6 (NOT 1, 2, 3, 4, 5, 6!)
    assert.deepEqual(sb.DB.visitsClinic.map(r => r.id), ['4', '5', '6'],
      'Page 2 must display strictly records 4, 5, 6 without prepending previous page items');
    console.log('✓ Test 1 Passed: Page 2 does not duplicate or prepend page 1 records.');
  }

  // Test 2: Period filter change must NOT leak old month records into new month
  {
    const sb = createSandbox({
      _mockServerPages: {
        1: { records: [{ id: 'oct-1', date: '2026-10-01' }], hasMore: false }
      }
    });

    // Local DB previously had sep records from previous period
    sb.DB.visitsClinic = [{ id: 'sep-1', date: '2026-09-15' }, { id: 'sep-2', date: '2026-09-20' }];

    // Active query filter is October
    sb._currentQueryOptions = {
      where: [{ field: 'date', op: '>=', value: '2026-10-01' }, { field: 'date', op: '<=', value: '2026-10-31' }]
    };

    // Neither sep-1 nor sep-2 are in PENDING_UPSERT_IDS
    await sb.loadFirestorePage('visitsClinic', 1);
    assert.deepEqual(sb.DB.visitsClinic.map(r => r.id), ['oct-1'],
      'Filtered October page must NOT leak September cached records');
    console.log('✓ Test 2 Passed: Period filter change strictly excludes records from different periods.');
  }

  // Test 3: Deleted record from another device (absent on server) must NOT re-appear from stale local cache
  {
    const sb = createSandbox({
      _mockServerPages: {
        1: { records: [{ id: 'active-1', date: '2026-10-01' }], hasMore: false }
      }
    });

    // Local cache had deleted-remotely record
    sb.DB.visitsClinic = [{ id: 'active-1', date: '2026-10-01' }, { id: 'deleted-remotely', date: '2026-10-02' }];

    await sb.loadFirestorePage('visitsClinic', 1);
    assert.deepEqual(sb.DB.visitsClinic.map(r => r.id), ['active-1'],
      'Record deleted on server must disappear and never re-appear from local cache');
    console.log('✓ Test 3 Passed: Remotely deleted records do not resurrect from local cache.');
  }

  // Test 4: Truly pending record (in PENDING_UPSERT_IDS matching filter) is safely kept on page 1
  {
    const sb = createSandbox({
      _mockServerPages: {
        1: { records: [{ id: 'server-1', date: '2026-10-01' }], hasMore: false }
      }
    });

    // Register pending record that was saved offline
    sb.getPendingIdsForKey('visitsClinic').add('pending-1');
    sb.DB.visitsClinic = [
      { id: 'pending-1', date: '2026-10-05' },
      { id: 'server-1', date: '2026-10-01' }
    ];

    sb._currentQueryOptions = {
      where: [{ field: 'date', op: '>=', value: '2026-10-01' }, { field: 'date', op: '<=', value: '2026-10-31' }]
    };

    await sb.loadFirestorePage('visitsClinic', 1);
    assert.deepEqual(sb.DB.visitsClinic.map(r => r.id), ['pending-1', 'server-1'],
      'Genuine pending record matching filter must be prepended on page 1');
    console.log('✓ Test 4 Passed: Truly pending offline records are preserved on page 1.');
  }

  console.log('\nALL PAGINATION & FILTER BEHAVIORAL TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
