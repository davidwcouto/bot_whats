import { IMediaDataTransformation } from '../../../../../media';
import { XmlComponent } from '../../../../../xml-components';
export type GroupChild = XmlComponent;
export type WpgGroupCoreOptions = {
    readonly children: readonly GroupChild[];
};
export type WpgGroupOptions = WpgGroupCoreOptions & {
    readonly transformation: IMediaDataTransformation;
};
export declare const createWpgGroup: (options: WpgGroupOptions) => XmlComponent;
