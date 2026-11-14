import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Button, Popconfirm, Skeleton, Tag } from "antd";
import dayjs from "dayjs";
import { CONTRACT_STATUS_META, teacherContractService } from "../../../services/teacherContract.service";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";

const formatDate = (value?: string | null) => (value ? dayjs(value).format("DD/MM/YYYY") : "—");

export default function TeacherContractCard() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: contracts, isPending, isError } = useQuery({
    queryKey: ["teacher-contracts"],
    queryFn: teacherContractService.listMine,
  });

  const signMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "SIGN" | "DECLINE" }) => teacherContractService.sandboxSign(id, decision),
    onSuccess: (contract) => {
      message.success(contract.status === "ACTIVE" ? "Đã ký hợp đồng. Bạn có thể mở lớp." : "Đã từ chối ký hợp đồng.");
      queryClient.invalidateQueries({ queryKey: ["teacher-contracts"] });
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  if (isPending) return <Skeleton active paragraph={{ rows: 2 }} />;
  if (isError) return <div className="text-sm text-rose-600">Không tải được hợp đồng giảng dạy.</div>;

  const current = contracts.find((c) => c.status === "ACTIVE") ?? contracts.find((c) => c.status === "PENDING_SIGNATURE") ?? contracts[0];

  return (
    <div className="border-t border-slate-100 pt-4">
      <h4 className="mb-3 text-sm font-bold text-slate-800">Hợp đồng giảng dạy</h4>
      {!current ? (
        <p className="text-sm text-slate-500 m-0">
          Bạn chưa có hợp đồng giảng dạy. Edunity sẽ gửi hợp đồng điện tử để bạn ký trước khi mở lớp.
        </p>
      ) : (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">{current.contractCode}</span>
            <Tag color={CONTRACT_STATUS_META[current.status].color} className="!m-0">
              {CONTRACT_STATUS_META[current.status].label}
            </Tag>
            {current.provider === "SANDBOX" && <Tag className="!m-0">Sandbox</Tag>}
          </div>
          <div className="text-xs text-slate-500">
            Hiệu lực: <strong>{formatDate(current.effectiveFrom)}</strong> → <strong>{formatDate(current.expiresAt)}</strong>
            {current.signedAt && <> · Ký ngày {formatDate(current.signedAt)}</>}
          </div>
          {current.terminationReason && <div className="text-sm text-rose-700">Lý do: {current.terminationReason}</div>}
          {current.status !== "ACTIVE" && current.status !== "PENDING_SIGNATURE" && (
            <div className="text-sm text-amber-700">Bạn chưa thể mở lớp mới cho đến khi có hợp đồng còn hiệu lực.</div>
          )}
          {current.canSignInSandbox && (
            <div className="flex gap-2 mt-1">
              <Button
                type="primary"
                loading={signMutation.isPending}
                onClick={() => signMutation.mutate({ id: current.id, decision: "SIGN" })}
              >
                Ký hợp đồng
              </Button>
              <Popconfirm
                title="Từ chối ký hợp đồng này?"
                onConfirm={() => signMutation.mutate({ id: current.id, decision: "DECLINE" })}
              >
                <Button danger disabled={signMutation.isPending}>Từ chối</Button>
              </Popconfirm>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
