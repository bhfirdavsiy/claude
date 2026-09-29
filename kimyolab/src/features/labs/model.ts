import type {ExternalLabBinding} from '../../integrations/external-labs/types.ts';

export interface NativeLabCatalogItem {
  kind:'native';
  id:string;
  title:string;
  goal:string;
  grade:number;
  learningUnitId:string;
  learningUnitTitle:string;
  launchable:boolean;
  executionMode:'engine'|'guided'|'unavailable';
  hardeningStatus?:'reaction-grounded-partial'|'chemistry-grounded-partial'|'procedural-only';
}
export interface ExternalLabCatalogItem {
  kind:'external';
  binding:ExternalLabBinding;
  grades:number[];
  learningUnits:Array<{id:string;grade:number;title:string}>;
}
export interface LabCatalogModel {
  native:NativeLabCatalogItem[];
  external:ExternalLabCatalogItem[];
}
