import { BuilderElement } from '../../../../xml-components';
import { MathComponent } from '../../math-component';
export type IMathPreSubSuperScriptOptions = {
    readonly children: readonly MathComponent[];
    readonly subScript: readonly MathComponent[];
    readonly superScript: readonly MathComponent[];
};
export declare class MathPreSubSuperScript extends BuilderElement {
    constructor({ children, subScript, superScript }: IMathPreSubSuperScriptOptions);
}
