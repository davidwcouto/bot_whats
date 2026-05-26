import { IBorderOptions } from '../../border';
import { XmlComponent } from '../../xml-components';
export type ITableBordersOptions = {
    readonly top?: IBorderOptions;
    readonly bottom?: IBorderOptions;
    readonly left?: IBorderOptions;
    readonly right?: IBorderOptions;
    readonly insideHorizontal?: IBorderOptions;
    readonly insideVertical?: IBorderOptions;
};
export declare class TableBorders extends XmlComponent {
    static readonly NONE: ITableBordersOptions;
    constructor(options: ITableBordersOptions);
}
