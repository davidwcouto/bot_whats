import { XmlComponent } from '../../../xml-components';
import { MathComponent } from '../math-component';
export type IMathFractionOptions = {
    readonly numerator: readonly MathComponent[];
    readonly denominator: readonly MathComponent[];
};
export declare class MathFraction extends XmlComponent {
    constructor(options: IMathFractionOptions);
}
