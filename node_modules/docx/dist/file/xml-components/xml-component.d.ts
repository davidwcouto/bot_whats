import { BaseXmlComponent, IContext } from './base';
import { IXmlableObject } from './xmlable-object';
export declare const EMPTY_OBJECT: {};
export declare abstract class XmlComponent extends BaseXmlComponent {
    protected root: (BaseXmlComponent | string | any)[];
    constructor(rootKey: string);
    prepForXml(context: IContext): IXmlableObject | undefined;
    addChildElement(child: XmlComponent | string): XmlComponent;
}
export declare abstract class IgnoreIfEmptyXmlComponent extends XmlComponent {
    private readonly includeIfEmpty;
    constructor(rootKey: string, includeIfEmpty?: boolean);
    prepForXml(context: IContext): IXmlableObject | undefined;
}
