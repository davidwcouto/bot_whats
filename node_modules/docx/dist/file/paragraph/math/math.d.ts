import { XmlComponent } from '../../xml-components';
import { MathComponent } from './math-component';
export type IMathOptions = {
    readonly children: readonly MathComponent[];
};
export declare class Math extends XmlComponent {
    constructor(options: IMathOptions);
}
