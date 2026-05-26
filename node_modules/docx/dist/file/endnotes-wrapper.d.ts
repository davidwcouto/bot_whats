import { IViewWrapper } from './document-wrapper';
import { Endnotes } from './endnotes/endnotes';
import { Relationships } from './relationships';
export declare class EndnotesWrapper implements IViewWrapper {
    private readonly endnotes;
    private readonly relationships;
    constructor();
    get View(): Endnotes;
    get Relationships(): Relationships;
}
