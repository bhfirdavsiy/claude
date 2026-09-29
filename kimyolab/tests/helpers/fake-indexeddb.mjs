// Spec-compliant in-memory IndexedDB (fake-indexeddb) so that keyPaths, indexes,
// versionchange upgrades, `add` constraint errors and aborts behave like browsers.
import {IDBFactory} from 'fake-indexeddb';

export function createFakeIndexedDb(){
  return new IDBFactory();
}
