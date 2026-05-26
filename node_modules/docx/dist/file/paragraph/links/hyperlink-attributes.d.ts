import { XmlAttributeComponent } from '../../xml-components';
export type IHyperlinkAttributesProperties = {
    readonly id?: string;
    readonly anchor?: string;
    readonly history: number;
};
export declare class HyperlinkAttributes extends XmlAttributeComponent<IHyperlinkAttributesProperties> {
    protected readonly xmlKeys: {
        id: string;
        history: string;
        anchor: string;
    };
}
