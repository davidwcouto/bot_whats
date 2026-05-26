import { XmlComponent } from '../../xml-components';
import { TableCell } from '../table-cell';
import { ITableRowPropertiesOptions } from './table-row-properties';
export type ITableRowOptions = {
    readonly children: readonly TableCell[];
} & ITableRowPropertiesOptions;
export declare class TableRow extends XmlComponent {
    private readonly options;
    constructor(options: ITableRowOptions);
    get CellCount(): number;
    get cells(): readonly TableCell[];
    addCellToIndex(cell: TableCell, index: number): void;
    addCellToColumnIndex(cell: TableCell, columnIndex: number): void;
    rootIndexToColumnIndex(rootIndex: number): number;
    columnIndexToRootIndex(columnIndex: number, allowEndNewCell?: boolean): number;
}
