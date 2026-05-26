import { IParagraphStylePropertiesOptions, IRunStylePropertiesOptions } from '../../paragraph';
import { IStyleOptions, Style } from './style';
export type IBaseParagraphStyleOptions = {
    readonly paragraph?: IParagraphStylePropertiesOptions;
    readonly run?: IRunStylePropertiesOptions;
} & IStyleOptions;
export type IParagraphStyleOptions = {
    readonly id: string;
} & IBaseParagraphStyleOptions;
export declare class StyleForParagraph extends Style {
    private readonly paragraphProperties;
    private readonly runProperties;
    constructor(options: IParagraphStyleOptions);
}
