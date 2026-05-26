import { SimpleField } from '../run/simple-field';
export declare enum NumberedItemReferenceFormat {
    NONE = "none",
    RELATIVE = "relative",
    NO_CONTEXT = "no_context",
    FULL_CONTEXT = "full_context"
}
export type INumberedItemReferenceOptions = {
    readonly hyperlink?: boolean;
    readonly referenceFormat?: NumberedItemReferenceFormat;
};
export declare class NumberedItemReference extends SimpleField {
    constructor(bookmarkId: string, cachedValue?: string, options?: INumberedItemReferenceOptions);
}
