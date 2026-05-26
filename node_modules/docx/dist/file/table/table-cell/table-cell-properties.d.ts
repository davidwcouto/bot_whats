import { ICellMergeAttributes } from '../../track-revision';
import { IChangedAttributesProperties } from '../../track-revision/track-revision';
import { TableVerticalAlign } from '../../vertical-align';
import { IgnoreIfEmptyXmlComponent, XmlComponent } from '../../xml-components';
import { IShadingAttributesProperties } from '../../shading';
import { ITableCellMarginOptions } from '../table-properties/table-cell-margin';
import { ITableWidthProperties } from '../table-width';
import { ITableCellBorders, TextDirection, VerticalMergeType } from './table-cell-components';
export type ITableCellPropertiesOptionsBase = {
    readonly shading?: IShadingAttributesProperties;
    readonly margins?: ITableCellMarginOptions;
    readonly verticalAlign?: TableVerticalAlign;
    readonly textDirection?: (typeof TextDirection)[keyof typeof TextDirection];
    readonly verticalMerge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType];
    readonly width?: ITableWidthProperties;
    readonly columnSpan?: number;
    readonly rowSpan?: number;
    readonly borders?: ITableCellBorders;
    readonly insertion?: IChangedAttributesProperties;
    readonly deletion?: IChangedAttributesProperties;
    readonly cellMerge?: ICellMergeAttributes;
};
export type ITableCellPropertiesOptions = {
    readonly revision?: ITableCellPropertiesChangeOptions;
    readonly includeIfEmpty?: boolean;
} & ITableCellPropertiesOptionsBase;
export type ITableCellPropertiesChangeOptions = ITableCellPropertiesOptionsBase & IChangedAttributesProperties;
export declare class TableCellProperties extends IgnoreIfEmptyXmlComponent {
    constructor(options: ITableCellPropertiesOptions);
}
export declare class TableCellPropertiesChange extends XmlComponent {
    constructor(options: ITableCellPropertiesChangeOptions);
}
