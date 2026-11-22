import { Input, type InputProps } from 'antd';
import { parsePrice } from '../../utils/classForm';

/**
 * Holds exactly what was typed and shows the amount it stands for beside it.
 * Not InputNumber: it drops text it cannot read, so a pasted "5.000.000đ" silently stayed 1.000.
 * Not regrouped in place either: that loses the selection, so typing over a price would append to it.
 */
export default function PriceInput(props: InputProps) {
  const amount = parsePrice(props.value);
  return (
    <Input
      {...props}
      inputMode="numeric"
      autoComplete="off"
      suffix={
        <span className="text-gray-500">
          {Number.isInteger(amount) ? `= ${amount.toLocaleString('vi-VN')}đ` : 'VNĐ'}
        </span>
      }
    />
  );
}
