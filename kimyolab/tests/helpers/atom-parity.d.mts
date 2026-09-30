export declare const ATOM_ACTIVITY:string;
export declare const ATOM_SEQUENCE:Array<[string,number]>;
export declare function runAtomParity(base:string,commandFor:(particle:any,delta:any)=>unknown):Promise<any>;
