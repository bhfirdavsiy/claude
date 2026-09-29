import type {ExternalLabProvider,ExternalLabProviderId} from './types.ts';
import {ExternalLinkLabProvider} from './external-link-provider.ts';
import {NobookLabProvider} from './nobook/nobook-provider.ts';

const providers=new Map<ExternalLabProviderId,ExternalLabProvider>([
  ['chemai',new ExternalLinkLabProvider('chemai')],
  ['chem-lab-station',new ExternalLinkLabProvider('chem-lab-station')],
  ['nobook',new NobookLabProvider()],
]);
export function getExternalLabProvider(id:ExternalLabProviderId){const provider=providers.get(id);if(!provider)throw new Error(`EXTERNAL_LAB_PROVIDER_NOT_FOUND:${id}`);return provider;}
