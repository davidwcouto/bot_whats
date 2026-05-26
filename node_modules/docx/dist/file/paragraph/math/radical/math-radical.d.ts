import { XmlComponent } from '../../../xml-components';
import { MathComponent } from '../math-component';
export type IMathRadicalOptions = {
    readonly children: readonly MathComponent[];
    readonly degree?: readonly MathComponent[];
};
export declare class MathRadical extends XmlComponent {
    constructor(options: IMathRadicalOptions);
}
