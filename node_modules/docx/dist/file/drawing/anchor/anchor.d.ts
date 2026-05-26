import { IExtendedMediaData, IMediaDataTransformation } from '../../media';
import { XmlComponent } from '../../xml-components';
import { IDrawingOptions } from '../drawing';
export declare class Anchor extends XmlComponent {
    constructor({ mediaData, transform, drawingOptions, }: {
        readonly mediaData: IExtendedMediaData;
        readonly transform: IMediaDataTransformation;
        readonly drawingOptions: IDrawingOptions;
    });
}
