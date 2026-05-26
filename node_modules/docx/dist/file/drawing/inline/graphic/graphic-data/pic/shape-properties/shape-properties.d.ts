import { IMediaDataTransformation } from '../../../../../../media';
import { XmlComponent } from '../../../../../../xml-components';
import { OutlineOptions } from './outline/outline';
import { SolidFillOptions } from './outline/solid-fill';
export declare class ShapeProperties extends XmlComponent {
    private readonly form;
    constructor({ element, outline, solidFill, transform, }: {
        readonly element: string;
        readonly outline?: OutlineOptions;
        readonly solidFill?: SolidFillOptions;
        readonly transform: IMediaDataTransformation;
    });
}
