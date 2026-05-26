import { FileChild } from '../file-child';
import { IParagraphOptions } from '../paragraph';
import { VmlShapeStyle } from './shape/shape';
type ITextboxOptions = Omit<IParagraphOptions, "style"> & {
    readonly style?: VmlShapeStyle;
};
export declare class Textbox extends FileChild {
    constructor({ style, children, ...rest }: ITextboxOptions);
}
export {};
