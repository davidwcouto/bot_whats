import { IContext, IXmlableObject, XmlComponent } from '../../xml-components';
export type DocPropertiesOptions = {
    readonly name: string;
    readonly description?: string;
    readonly title?: string;
    readonly id?: string;
};
export declare class DocProperties extends XmlComponent {
    private readonly docPropertiesUniqueNumericId;
    constructor({ name, description, title, id }?: DocPropertiesOptions);
    prepForXml(context: IContext): IXmlableObject | undefined;
}
