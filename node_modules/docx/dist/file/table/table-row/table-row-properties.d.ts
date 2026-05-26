import { IChangedAttributesProperties } from '../../track-revision/track-revision';
import { IgnoreIfEmptyXmlComponent, XmlComponent } from '../../xml-components';
import { PositiveUniversalMeasure } from '../../../util/values';
import { HeightRule } from './table-row-height';
import { ITableCellSpacingProperties } from '../table-cell-spacing';
export type ITableRowPropertiesOptionsBase = {
    readonly cantSplit?: boolean;
    readonly tableHeader?: boolean;
    readonly height?: {
        readonly value: number | PositiveUniversalMeasure;
        readonly rule: (typeof HeightRule)[keyof typeof HeightRule];
    };
    readonly cellSpacing?: ITableCellSpacingProperties;
};
export type ITableRowPropertiesOptions = ITableRowPropertiesOptionsBase & {
    readonly insertion?: IChangedAttributesProperties;
    readonly deletion?: IChangedAttributesProperties;
    readonly revision?: ITableRowPropertiesChangeOptions;
    readonly includeIfEmpty?: boolean;
};
export type ITableRowPropertiesChangeOptions = ITableRowPropertiesOptionsBase & IChangedAttributesProperties;
export declare class TableRowProperties extends IgnoreIfEmptyXmlComponent {
    constructor(options: ITableRowPropertiesOptions);
}
export declare class TableRowPropertiesChange extends XmlComponent {
    constructor(options: ITableRowPropertiesChangeOptions);
}
