import { IDocumentDefaultsOptions } from './defaults';
import { IBaseCharacterStyleOptions, IBaseParagraphStyleOptions } from './style';
import { IStylesOptions } from './styles';
export type IDefaultStylesOptions = {
    readonly document?: IDocumentDefaultsOptions;
    readonly title?: IBaseParagraphStyleOptions;
    readonly heading1?: IBaseParagraphStyleOptions;
    readonly heading2?: IBaseParagraphStyleOptions;
    readonly heading3?: IBaseParagraphStyleOptions;
    readonly heading4?: IBaseParagraphStyleOptions;
    readonly heading5?: IBaseParagraphStyleOptions;
    readonly heading6?: IBaseParagraphStyleOptions;
    readonly strong?: IBaseParagraphStyleOptions;
    readonly listParagraph?: IBaseParagraphStyleOptions;
    readonly hyperlink?: IBaseCharacterStyleOptions;
    readonly footnoteReference?: IBaseCharacterStyleOptions;
    readonly footnoteText?: IBaseParagraphStyleOptions;
    readonly footnoteTextChar?: IBaseCharacterStyleOptions;
    readonly endnoteReference?: IBaseCharacterStyleOptions;
    readonly endnoteText?: IBaseParagraphStyleOptions;
    readonly endnoteTextChar?: IBaseCharacterStyleOptions;
};
export declare class DefaultStylesFactory {
    newInstance(options?: IDefaultStylesOptions): IStylesOptions;
}
