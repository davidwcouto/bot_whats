import { XmlAttributeComponent } from '../../xml-components';
export declare class EndnoteAttributes extends XmlAttributeComponent<{
    readonly type?: string;
    readonly id: number;
}> {
    protected readonly xmlKeys: {
        type: string;
        id: string;
    };
}
