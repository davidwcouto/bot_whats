import { XmlAttributeComponent, XmlComponent } from '../../xml-components';
import { IChangedAttributesProperties } from '../track-revision';
export declare const VerticalMergeRevisionType: {
    readonly CONTINUE: "cont";
    readonly RESTART: "rest";
};
export type ICellMergeAttributes = IChangedAttributesProperties & {
    readonly verticalMerge?: (typeof VerticalMergeRevisionType)[keyof typeof VerticalMergeRevisionType];
    readonly verticalMergeOriginal?: (typeof VerticalMergeRevisionType)[keyof typeof VerticalMergeRevisionType];
};
export declare class CellMergeAttributes extends XmlAttributeComponent<ICellMergeAttributes> {
    protected readonly xmlKeys: {
        id: string;
        author: string;
        date: string;
        verticalMerge: string;
        verticalMergeOriginal: string;
    };
}
export declare class CellMerge extends XmlComponent {
    constructor(options: ICellMergeAttributes);
}
