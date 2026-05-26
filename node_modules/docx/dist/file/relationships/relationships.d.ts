import { XmlComponent } from '../xml-components';
import { RelationshipType, TargetModeType } from './relationship/relationship';
export declare class Relationships extends XmlComponent {
    constructor();
    addRelationship(id: number | string, type: RelationshipType, target: string, targetMode?: (typeof TargetModeType)[keyof typeof TargetModeType]): void;
    get RelationshipCount(): number;
}
