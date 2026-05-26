import { WidthType } from '..';
import { XmlComponent } from '../../xml-components';
export type ITableCellMarginOptions = {
    readonly marginUnitType?: (typeof WidthType)[keyof typeof WidthType];
    readonly top?: number;
    readonly bottom?: number;
    readonly left?: number;
    readonly right?: number;
};
export declare const createTableCellMargin: (options: ITableCellMarginOptions) => XmlComponent | undefined;
export declare const createCellMargin: (options: ITableCellMarginOptions) => XmlComponent | undefined;
