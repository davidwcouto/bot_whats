import { IChangedAttributesProperties } from '../../track-revision/track-revision';
import { IgnoreIfEmptyXmlComponent } from '../../xml-components';
import { AlignmentType } from '../../paragraph';
import { IShadingAttributesProperties } from '../../shading';
import { ITableWidthProperties } from '../table-width';
import { ITableBordersOptions } from './table-borders';
import { ITableCellMarginOptions } from './table-cell-margin';
import { ITableFloatOptions } from './table-float-properties';
import { TableLayoutType } from './table-layout';
import { ITableCellSpacingProperties } from '../table-cell-spacing';
import { ITableLookOptions } from './table-look';
export type ITablePropertiesOptionsBase = {
    readonly width?: ITableWidthProperties;
    readonly indent?: ITableWidthProperties;
    readonly layout?: (typeof TableLayoutType)[keyof typeof TableLayoutType];
    readonly borders?: ITableBordersOptions;
    readonly float?: ITableFloatOptions;
    readonly shading?: IShadingAttributesProperties;
    readonly style?: string;
    readonly alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    readonly cellMargin?: ITableCellMarginOptions;
    readonly visuallyRightToLeft?: boolean;
    readonly tableLook?: ITableLookOptions;
    readonly cellSpacing?: ITableCellSpacingProperties;
};
export type ITablePropertiesChangeOptions = ITablePropertiesOptions & IChangedAttributesProperties;
export type ITablePropertiesOptions = {
    readonly revision?: ITablePropertiesChangeOptions;
    readonly includeIfEmpty?: boolean;
} & ITablePropertiesOptionsBase;
export declare class TableProperties extends IgnoreIfEmptyXmlComponent {
    constructor(options: ITablePropertiesOptions);
}
