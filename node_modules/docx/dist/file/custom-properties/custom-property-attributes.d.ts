import { XmlAttributeComponent } from '../xml-components';
export declare class CustomPropertyAttributes extends XmlAttributeComponent<{
    readonly formatId: string;
    readonly pid: string;
    readonly name: string;
}> {
    protected readonly xmlKeys: {
        formatId: string;
        pid: string;
        name: string;
    };
}
