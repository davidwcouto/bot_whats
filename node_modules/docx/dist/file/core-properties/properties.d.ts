import { FontOptions } from '../fonts/font-table';
import { ICommentsOptions } from '../paragraph/run/comment-run';
import { IHyphenationOptions } from '../settings';
import { ICompatibilityOptions } from '../settings/compatibility';
import { XmlComponent } from '../xml-components';
import { ICustomPropertyOptions } from '../custom-properties';
import { IDocumentBackgroundOptions } from '../document';
import { ISectionOptions } from '../file';
import { INumberingOptions } from '../numbering';
import { Paragraph } from '../paragraph';
import { IStylesOptions } from '../styles';
export type IPropertiesOptions = {
    readonly sections: readonly ISectionOptions[];
    readonly title?: string;
    readonly subject?: string;
    readonly creator?: string;
    readonly keywords?: string;
    readonly description?: string;
    readonly lastModifiedBy?: string;
    readonly revision?: number;
    readonly externalStyles?: string;
    readonly styles?: IStylesOptions;
    readonly numbering?: INumberingOptions;
    readonly comments?: ICommentsOptions;
    readonly footnotes?: Readonly<Record<string, {
        readonly children: readonly Paragraph[];
    }>>;
    readonly endnotes?: Readonly<Record<string, {
        readonly children: readonly Paragraph[];
    }>>;
    readonly background?: IDocumentBackgroundOptions;
    readonly features?: {
        readonly trackRevisions?: boolean;
        readonly updateFields?: boolean;
    };
    readonly compatabilityModeVersion?: number;
    readonly compatibility?: ICompatibilityOptions;
    readonly customProperties?: readonly ICustomPropertyOptions[];
    readonly evenAndOddHeaderAndFooters?: boolean;
    readonly defaultTabStop?: number;
    readonly fonts?: readonly FontOptions[];
    readonly hyphenation?: IHyphenationOptions;
};
export declare class CoreProperties extends XmlComponent {
    constructor(options: Omit<IPropertiesOptions, "sections">);
}
