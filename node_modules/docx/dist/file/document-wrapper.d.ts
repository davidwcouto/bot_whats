import { Document, IDocumentOptions } from './document';
import { Endnotes } from './endnotes';
import { Footer } from './footer/footer';
import { FootNotes } from './footnotes';
import { Header } from './header/header';
import { Relationships } from './relationships';
import { XmlComponent } from './xml-components';
export type IViewWrapper = {
    readonly View: Document | Footer | Header | FootNotes | Endnotes | XmlComponent;
    readonly Relationships: Relationships;
};
export declare class DocumentWrapper implements IViewWrapper {
    private readonly document;
    private readonly relationships;
    constructor(options: IDocumentOptions);
    get View(): Document;
    get Relationships(): Relationships;
}
