import { XmlAttributeComponent } from '../xml-components';
export type IChangedAttributesProperties = {
    readonly id: number;
    readonly author: string;
    readonly date: string;
};
export declare class ChangeAttributes extends XmlAttributeComponent<IChangedAttributesProperties> {
    protected readonly xmlKeys: {
        id: string;
        author: string;
        date: string;
    };
}
