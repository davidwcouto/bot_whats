import { XmlComponent } from '../xml-components';
import { Paragraph } from '../paragraph';
export declare class Endnotes extends XmlComponent {
    constructor();
    createEndnote(id: number, paragraph: readonly Paragraph[]): void;
}
