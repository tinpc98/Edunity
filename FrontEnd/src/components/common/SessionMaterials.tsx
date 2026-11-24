import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Popconfirm, Spin, Upload, message } from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileWordOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionKeys, sessionService } from '../../services/session.service';
import type { SessionMaterial } from '../../services/session.service';
import { getFriendlyErrorMessage } from '../../utils/apiErrorMap';

// Same limits as the Backend (storageService: SESSION_MATERIAL)
const MAX_MATERIALS = 10;
const MAX_MATERIAL_MB = 20;
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp';

const iconFor = (material: SessionMaterial) => {
  const name = (material.fileName || material.title).toLowerCase();
  if (/\.docx?$/.test(name)) return <FileWordOutlined className="text-blue-600" />;
  if (/\.pptx?$/.test(name)) return <FilePptOutlined className="text-orange-600" />;
  if (name.endsWith('.pdf')) return <FilePdfOutlined className="text-red-600" />;
  if (/\.(jpe?g|png|webp)$/.test(name)) return <FileImageOutlined className="text-emerald-600" />;
  return <FileOutlined className="text-gray-500" />;
};

type Viewer = 'pdf' | 'image' | 'docx';
// What the browser can show: PDF and images natively, .docx through docx-preview. PowerPoint and old .doc are downloaded.
const viewerFor = (material: SessionMaterial): Viewer | null => {
  const name = (material.fileName || material.title).toLowerCase();
  if (material.mimeType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (material.mimeType?.startsWith('image/') || /\.(jpe?g|png|webp)$/.test(name)) return 'image';
  if (name.endsWith('.docx')) return 'docx';
  return null;
};

/** Renders a Word document in the page; the file is read from its signed URL and never leaves the browser. */
function DocxView({ url }: { url: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ renderAsync }, response] = await Promise.all([import('docx-preview'), fetch(url)]);
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (cancelled || !container.current) return;
        await renderAsync(blob, container.current, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true });
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <>
      {state === 'loading' && <div className="py-10 text-center"><Spin /></div>}
      {state === 'error' && (
        <Alert type="warning" showIcon title="Không hiển thị được tài liệu này. Hãy bấm Tải về để mở bằng Word." />
      )}
      <div ref={container} className="max-h-[70vh] overflow-auto" />
    </>
  );
}

const formatSize = (size: number | null) =>
  !size ? '' : size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

interface SessionMaterialsProps {
  sessionId: string;
  /** The class's teacher, while the class is neither closed nor rejected */
  canManage?: boolean;
}

/** The materials of one session: everyone allowed downloads them, the teacher also uploads and removes them. */
export default function SessionMaterials({ sessionId, canManage = false }: SessionMaterialsProps) {
  const queryClient = useQueryClient();
  const queryKey = sessionKeys.materials(sessionId);
  const [viewing, setViewing] = useState<SessionMaterial | null>(null);
  const { data: materials = [], isPending, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => sessionService.listMaterials(sessionId),
    // Download URLs are signed for a few minutes
    staleTime: 60_000,
  });

  const updated = (list: SessionMaterial[]) => {
    queryClient.setQueryData(queryKey, list);
    // The material count shown on the session lists
    queryClient.invalidateQueries({ queryKey: ['classes'] });
  };
  const addMutation = useMutation({
    mutationFn: (file: File) => sessionService.addMaterial(sessionId, file),
    onSuccess: (list) => {
      updated(list);
      message.success('Đã tải tài liệu lên.');
    },
    onError: (err) => message.error(getFriendlyErrorMessage(err, 'Không thể tải tài liệu lên.')),
  });
  const removeMutation = useMutation({
    mutationFn: (materialId: string) => sessionService.removeMaterial(sessionId, materialId),
    onSuccess: (list) => {
      updated(list);
      message.success('Đã xóa tài liệu.');
    },
    onError: (err) => message.error(getFriendlyErrorMessage(err, 'Không thể xóa tài liệu.')),
  });

  const checkFile = (file: File) => {
    if (!new RegExp(`(${ACCEPT.split(',').map((ext) => ext.replace('.', '\\.')).join('|')})$`, 'i').test(file.name)) {
      message.error('Chỉ nhận PDF, Word (.doc, .docx), PowerPoint (.ppt, .pptx) hoặc ảnh.');
      return false;
    }
    if (file.size > MAX_MATERIAL_MB * 1024 * 1024) {
      message.error(`Tệp tối đa ${MAX_MATERIAL_MB} MB.`);
      return false;
    }
    addMutation.mutate(file);
    return false; // uploaded by the mutation, not by antd
  };

  if (isPending) return <div className="py-4 text-center"><Spin size="small" /></div>;
  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        title="Không tải được tài liệu"
        description={getFriendlyErrorMessage(error, 'Vui lòng thử lại.')}
        action={<Button size="small" onClick={() => refetch()}>Thử lại</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {materials.length === 0 ? (
        <p className="text-sm text-gray-500 m-0">
          {canManage ? 'Chưa có tài liệu. Tải lên bài giảng, đề bài hoặc tài liệu tham khảo cho buổi này.' : 'Giáo viên chưa đăng tài liệu cho buổi học này.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 border border-gray-100 rounded-xl m-0 p-0 list-none">
          {materials.map((material) => (
            <li key={material.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-xl shrink-0" aria-hidden>{iconFor(material)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{material.title}</div>
                {material.size ? <div className="text-xs text-gray-500">{formatSize(material.size)}</div> : null}
              </div>
              {material.url && viewerFor(material) && (
                <Button size="small" icon={<EyeOutlined />} onClick={() => setViewing(material)} aria-label={`Xem ${material.title}`} className="rounded-lg text-xs">
                  Xem
                </Button>
              )}
              {material.url && (
                <a href={material.url} target="_blank" rel="noopener noreferrer" aria-label={`Tải ${material.title}`}>
                  <Button size="small" icon={<DownloadOutlined />} className="rounded-lg text-xs">
                    Tải về
                  </Button>
                </a>
              )}
              {canManage && (
                <Popconfirm
                  title="Xóa tài liệu này?"
                  onConfirm={() => removeMutation.mutate(material.id)}
                  okText="Xóa"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Xóa ${material.title}`} className="rounded-lg" />
                </Popconfirm>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        title={viewing?.title}
        open={Boolean(viewing)}
        onCancel={() => setViewing(null)}
        footer={
          viewing?.url ? (
            <a href={viewing.url} target="_blank" rel="noopener noreferrer">
              <Button icon={<DownloadOutlined />}>Tải về</Button>
            </a>
          ) : null
        }
        width={1000}
        destroyOnHidden
        centered
      >
        {viewing?.url && viewerFor(viewing) === 'pdf' && (
          <iframe title={viewing.title} src={viewing.url} className="w-full h-[75vh] border-0 rounded-lg" />
        )}
        {viewing?.url && viewerFor(viewing) === 'image' && (
          <img src={viewing.url} alt={viewing.title} className="max-w-full max-h-[75vh] mx-auto block" />
        )}
        {viewing?.url && viewerFor(viewing) === 'docx' && <DocxView url={viewing.url} />}
      </Modal>

      {canManage && (
        <div>
          <Upload accept={ACCEPT} showUploadList={false} beforeUpload={checkFile} disabled={addMutation.isPending || materials.length >= MAX_MATERIALS}>
            <Button
              icon={<UploadOutlined />}
              loading={addMutation.isPending}
              disabled={materials.length >= MAX_MATERIALS}
              className="rounded-lg"
            >
              Tải tài liệu lên
            </Button>
          </Upload>
          <div className="text-xs text-gray-500 mt-1.5">
            PDF, Word, PowerPoint hoặc ảnh, tối đa {MAX_MATERIAL_MB} MB mỗi tệp và {MAX_MATERIALS} tệp mỗi buổi. Chỉ học viên đã đăng ký lớp xem được.
            {' '}PDF, ảnh và Word (.docx) xem được ngay trên trang; nên lưu slide PowerPoint thành PDF để học viên xem trực tiếp.
          </div>
        </div>
      )}
    </div>
  );
}
