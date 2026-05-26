import { IRunStylePropertiesOptions } from '../../paragraph/run/properties';
import { IStyleOptions, Style } from './style';
export type IBaseCharacterStyleOptions = {
    readonly run?: IRunStylePropertiesOptions;
} & IStyleOptions;
export type ICharacterStyleOptions = {
    readonly id: string;
} & IBaseCharacterStyleOptions;
export declare class StyleForCharacter extends Style {
    private readonly runProperties;
    constructor(options: ICharacterStyleOptions);
}
