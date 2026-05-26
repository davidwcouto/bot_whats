import { Paragraph } from '../../paragraph';
import { IContext, IXmlableObject, XmlComponent } from '../../xml-components';
import { Table } from '../table';
import { ITableCellPropertiesOptions } from './table-cell-properties';
export type ITableCellOptions = {
    readonly children: readonly (Paragraph | Table)[];
} & ITableCellPropertiesOptions;
export declare class TableCell extends XmlComponent {
    readonly options: ITableCellOptions;
    constructor(options: ITableCellOptions);
    prepForXml(context: IContext): IXmlableObject | undefined;
}
