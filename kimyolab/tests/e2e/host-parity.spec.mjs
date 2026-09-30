// P2.2 — host parity: the SAME learner scenarios through the portal-simulation host (/kimyolab/) and the standalone
// single-file host give the SAME content version, activity, engine result, evidence, score, completion, mastery effect
// and outcome category. Allowed to differ: URL, shell, navigation transport, content transport, storage namespace.
import {test, expect} from '@playwright/test';
import {startHosts, runParity, SCENARIOS} from './host-scenarios.mjs';

let hosts;
test.beforeAll(async () => { hosts = await startHosts(); });
test.afterAll(async () => { await hosts?.close(); });

for (const scenario of SCENARIOS) {
  test(`host parity: ${scenario.title}`, async ({browser}) => {
    const [row] = await runParity(browser, hosts, [scenario]);
    for (const name of ['portal', 'standalone']) {
      expect(row.hosts[name].failure, `${name}: ${row.hosts[name].failure}`).toBeNull();
      expect(row.hosts[name].errors, name).toEqual([]);
    }
    expect(row.hosts.standalone.facts).toEqual(row.hosts.portal.facts);
    expect(row.hosts.standalone.semantic).toEqual(row.hosts.portal.semantic);
    expect(row.status).toBe('PASS');
  });
}
