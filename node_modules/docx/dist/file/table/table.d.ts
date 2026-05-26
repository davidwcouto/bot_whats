import { FileChild } from '../file-child';
import { AlignmentType } from '../paragraph';
import { ITableGridChangeOptions } from './grid';
import { ITableCellSpacingProperties } from './table-cell-spacing';
import { ITableBordersOptions, ITableFloatOptions, ITablePropertiesChangeOptions } from './table-properties';
import { ITableCellMarginOptions } from './table-properties/table-cell-margin';
import { TableLayoutType } from './table-properties/table-layout';
import { ITableLookOptions } from './table-properties/table-look';
import { TableRow } from './table-row';
import { ITableWidthProperties } from './table-width';
export type ITableOptions = {
    readonly rows: readonly TableRow[];
    readonly width?: ITableWidthProperties;
    readonly columnWidths?: readonly number[];
    readonly columnWidthsRevision?: ITableGridChangeOptions;
    readonly margins?: ITableCellMarginOptions;
    readonly indent?: ITableWidthProperties;
    readonly float?: ITableFloatOptions;
    readonly layout?: (typeof TableLayoutType)[keyof typeof TableLayoutType];
    readonly style?: string;
    readonly borders?: ITableBordersOptions;
    readonly alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    readonly visuallyRightToLeft?: boolean;
    readonly tableLook?: ITableLookOptions;
    readonly cellSpacing?: ITableCellSpacingProperties;
    readonly revision?: ITablePropertiesChangeOptions;
};
export declare class Table extends FileChild {
    constructor({ rows, width, columnWidths, columnWidthsRevision, margins, indent, float, layout, style, borders, alignment, visuallyRightToLeft, tableLook, cellSpacing, revision, }: ITableOptions);
}
