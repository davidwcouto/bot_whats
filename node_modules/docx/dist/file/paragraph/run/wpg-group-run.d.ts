import { DocPropertiesOptions } from '../../drawing/doc-properties/doc-properties';
import { IContext, IXmlableObject } from '../../xml-components';
import { Run } from '.';
import { IFloating } from '../../drawing';
import { IGroupChildMediaData, IMediaTransformation } from '../../media';
export * from '../../drawing/inline/graphic/graphic-data/wps/body-properties';
type CoreGroupOptions = {
    readonly children: readonly IGroupChildMediaData[];
    readonly transformation: IMediaTransformation;
    readonly floating?: IFloating;
    readonly altText?: DocPropertiesOptions;
};
export type IWpgGroupOptions = {
    readonly type: "wpg";
} & CoreGroupOptions;
export declare class WpgGroupRun extends Run {
    private readonly wpgGroupData;
    private readonly mediaDatas;
    constructor(options: IWpgGroupOptions);
    prepForXml(context: IContext): IXmlableObject | undefined;
}
