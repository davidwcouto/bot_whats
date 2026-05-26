import { IExtendedMediaData, IMediaDataTransformation } from '../../../../media';
import { XmlComponent } from '../../../../xml-components';
import { OutlineOptions } from './pic/shape-properties/outline/outline';
import { SolidFillOptions } from './pic/shape-properties/outline/solid-fill';
export declare class GraphicData extends XmlComponent {
    constructor({ mediaData, transform, outline, solidFill, }: {
        readonly mediaData: IExtendedMediaData;
        readonly transform: IMediaDataTransformation;
        readonly outline?: OutlineOptions;
        readonly solidFill?: SolidFillOptions;
    });
}
