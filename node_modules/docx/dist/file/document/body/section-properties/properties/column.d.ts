import { XmlComponent } from '../../../../xml-components';
import { PositiveUniversalMeasure } from '../../../../../util/values';
export type IColumnAttributes = {
    readonly width: number | PositiveUniversalMeasure;
    readonly space?: number | PositiveUniversalMeasure;
};
export declare class Column extends XmlComponent {
    constructor(options: IColumnAttributes);
}
