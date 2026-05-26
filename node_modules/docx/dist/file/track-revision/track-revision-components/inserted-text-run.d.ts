import { XmlComponent } from '../../xml-components';
import { IRunOptions } from '../../index';
import { IChangedAttributesProperties } from '../track-revision';
type IInsertedRunOptions = IChangedAttributesProperties & IRunOptions;
export declare class InsertedTextRun extends XmlComponent {
    constructor(options: IInsertedRunOptions);
}
export {};
