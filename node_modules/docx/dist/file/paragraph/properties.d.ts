import { IChangedAttributesProperties } from '../track-revision/track-revision';
import { IContext, IXmlableObject, IgnoreIfEmptyXmlComponent, XmlComponent } from '../xml-components';
import { IParagraphRunOptions } from '.';
import { IShadingAttributesProperties } from '../shading';
import { AlignmentType } from './formatting/alignment';
import { IBordersOptions } from './formatting/border';
import { IIndentAttributesProperties } from './formatting/indent';
import { ISpacingProperties } from './formatting/spacing';
import { HeadingLevel } from './formatting/style';
import { TabStopDefinition } from './formatting/tab-stop';
import { IFrameOptions } from './frame/frame-properties';
export type ILevelParagraphStylePropertiesOptions = {
    readonly alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    readonly thematicBreak?: boolean;
    readonly contextualSpacing?: boolean;
    readonly rightTabStop?: number;
    readonly leftTabStop?: number;
    readonly indent?: IIndentAttributesProperties;
    readonly spacing?: ISpacingProperties;
    readonly keepNext?: boolean;
    readonly keepLines?: boolean;
    readonly outlineLevel?: number;
};
export type IParagraphStylePropertiesOptions = {
    readonly border?: IBordersOptions;
    readonly shading?: IShadingAttributesProperties;
    readonly numbering?: {
        readonly reference: string;
        readonly level: number;
        readonly instance?: number;
        readonly custom?: boolean;
    } | false;
} & ILevelParagraphStylePropertiesOptions;
export type IParagraphPropertiesOptionsBase = {
    readonly heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
    readonly bidirectional?: boolean;
    readonly pageBreakBefore?: boolean;
    readonly tabStops?: readonly TabStopDefinition[];
    readonly style?: string;
    readonly bullet?: {
        readonly level: number;
    };
    readonly widowControl?: boolean;
    readonly frame?: IFrameOptions;
    readonly suppressLineNumbers?: boolean;
    readonly wordWrap?: boolean;
    readonly overflowPunctuation?: boolean;
    readonly scale?: number;
    readonly autoSpaceEastAsianText?: boolean;
    readonly run?: IParagraphRunOptions;
} & IParagraphStylePropertiesOptions;
export type IParagraphPropertiesChangeOptions = IChangedAttributesProperties & IParagraphPropertiesOptionsBase;
export type IParagraphPropertiesOptions = {
    readonly revision?: IParagraphPropertiesChangeOptions;
    readonly includeIfEmpty?: boolean;
} & IParagraphPropertiesOptionsBase;
export declare class ParagraphProperties extends IgnoreIfEmptyXmlComponent {
    private readonly numberingReferences;
    constructor(options?: IParagraphPropertiesOptions);
    push(item: XmlComponent): void;
    prepForXml(context: IContext): IXmlableObject | undefined;
}
export declare class ParagraphPropertiesChange extends XmlComponent {
    constructor(options: IParagraphPropertiesChangeOptions);
}
