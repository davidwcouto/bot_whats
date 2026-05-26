import { OutlineOptions } from '../drawing/inline/graphic/graphic-data/pic/shape-properties/outline/outline';
import { SolidFillOptions } from '../drawing/inline/graphic/graphic-data/pic/shape-properties/outline/solid-fill';
import { WpsShapeCoreOptions } from '../drawing/inline/graphic/graphic-data/wps';
export type IMediaDataTransformation = {
    readonly offset?: {
        readonly pixels: {
            readonly x: number;
            readonly y: number;
        };
        readonly emus?: {
            readonly x: number;
            readonly y: number;
        };
    };
    readonly pixels: {
        readonly x: number;
        readonly y: number;
    };
    readonly emus: {
        readonly x: number;
        readonly y: number;
    };
    readonly flip?: {
        readonly vertical?: boolean;
        readonly horizontal?: boolean;
    };
    readonly rotation?: number;
};
type CoreMediaData = {
    readonly fileName: string;
    readonly transformation: IMediaDataTransformation;
    readonly data: Buffer | Uint8Array | ArrayBuffer;
};
type RegularMediaData = {
    readonly type: "jpg" | "png" | "gif" | "bmp";
};
type SvgMediaData = {
    readonly type: "svg";
    readonly fallback: RegularMediaData & CoreMediaData;
};
export type WpsMediaData = {
    readonly type: "wps";
    readonly transformation: IMediaDataTransformation;
    readonly data: WpsShapeCoreOptions;
};
export type WpgCommonMediaData = {
    readonly outline?: OutlineOptions;
    readonly solidFill?: SolidFillOptions;
};
export type IGroupChildMediaData = (WpsMediaData | IMediaData) & WpgCommonMediaData;
export type WpgMediaData = {
    readonly type: "wpg";
    readonly transformation: IMediaDataTransformation;
    readonly children: readonly IGroupChildMediaData[];
};
export type IExtendedMediaData = IMediaData | WpsMediaData | WpgMediaData;
export type IMediaData = (RegularMediaData | SvgMediaData) & CoreMediaData;
export declare const WORKAROUND2 = "";
export {};
