                                                                          
import {ExternalLinkLabProvider} from './external-link-provider.js';
import {NobookLabProvider} from './nobook/nobook-provider.js';

const providers=new Map                                           ([
  ['chemai',new ExternalLinkLabProvider('chemai')],
  ['chem-lab-station',new ExternalLinkLabProvider('chem-lab-station')],
  ['nobook',new NobookLabProvider()],
]);
export function getExternalLabProvider(id                      ){const provider=providers.get(id);if(!provider)throw new Error(`EXTERNAL_LAB_PROVIDER_NOT_FOUND:${id}`);return provider;}
