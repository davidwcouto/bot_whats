import { IExtendedMediaData, IMediaDataTransformation } from '../../../media';
import { XmlComponent } from '../../../xml-components';
import { OutlineOptions } from './graphic-data/pic/shape-properties/outline/outline';
import { SolidFillOptions } from './graphic-data/pic/shape-properties/outline/solid-fill';
export declare class Graphic extends XmlComponent {
    private readonly data;
    constructor({ mediaData, transform, outline, solidFill, }: {
        readonly mediaData: IExtendedMediaData;
        readonly transform: IMediaDataTransformation;
        readonly outline?: OutlineOptions;
        readonly solidFill?: SolidFillOptions;
    });
}
