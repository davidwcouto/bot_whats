import { IRunOptions, Run } from './run';
export type ISymbolRunOptions = {
    readonly char: string;
    readonly symbolfont?: string;
} & IRunOptions;
export declare class SymbolRun extends Run {
    constructor(options: ISymbolRunOptions | string);
}
