import { XmlComponent } from '../xml-components';
import { PositiveUniversalMeasure } from '../../util/values';
export type ITableGridChangeOptions = {
    readonly id: number;
    readonly columnWidths: readonly number[] | readonly PositiveUniversalMeasure[];
};
export declare const createGridCol: (width?: number | PositiveUniversalMeasure) => XmlComponent;
export declare class TableGrid extends XmlComponent {
    constructor(widths: readonly number[] | readonly PositiveUniversalMeasure[], revision?: ITableGridChangeOptions);
}
export declare class TableGridChange extends XmlComponent {
    constructor(options: ITableGridChangeOptions);
}
