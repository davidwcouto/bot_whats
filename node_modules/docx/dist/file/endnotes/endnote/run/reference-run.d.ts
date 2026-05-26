import { Run } from '../../../paragraph/run';
import { XmlAttributeComponent, XmlComponent } from '../../../xml-components';
export declare class EndnoteReferenceRunAttributes extends XmlAttributeComponent<{
    readonly id: number;
}> {
    protected readonly xmlKeys: {
        id: string;
    };
}
export declare class EndnoteIdReference extends XmlComponent {
    constructor(id: number);
}
export declare class EndnoteReferenceRun extends Run {
    constructor(id: number);
}
