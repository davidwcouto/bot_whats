import { IBorderOptions } from '../../border';
import { IgnoreIfEmptyXmlComponent, XmlComponent } from '../../xml-components';
export type IBordersOptions = {
    readonly top?: IBorderOptions;
    readonly bottom?: IBorderOptions;
    readonly left?: IBorderOptions;
    readonly right?: IBorderOptions;
    readonly between?: IBorderOptions;
};
export declare class Border extends IgnoreIfEmptyXmlComponent {
    constructor(options: IBordersOptions);
}
export declare class ThematicBreak extends XmlComponent {
    constructor();
}
