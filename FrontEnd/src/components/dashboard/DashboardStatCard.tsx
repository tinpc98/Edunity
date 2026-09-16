import React from "react";
import { Card, Typography, Flex, Tag } from "antd";
import { ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";

const { Text, Title } = Typography;

interface DashboardStatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  suffix?: string;
  detail?: string;
}

export default function DashboardStatCard({
  title,
  value,
  icon,
  trend,
  suffix,
  detail
}: DashboardStatCardProps) {
  const isPositive = trend?.includes("+") || trend?.includes("tăng");
  const isNegative = trend?.includes("-") || trend?.includes("giảm");

  return (
    <Card 
      bordered={false} 
      className="shadow-sm hover:-translate-y-0.5 transition-all h-full" 
      style={{ borderRadius: 16 }}
      styles={{ body: { padding: '16px' } }}
    >
      <Flex justify="space-between" align="center" className="mb-3">
        <Text type="secondary" className="font-semibold text-xs sm:text-sm">{title}</Text>
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-[18px] shrink-0">
          {icon}
        </div>
      </Flex>
      <Flex justify="space-between" align="baseline">
        <div className="whitespace-nowrap flex items-baseline">
          <span className="text-2xl sm:text-[28px] font-extrabold text-gray-800 tracking-tight leading-none">
            {value}
          </span>
          {suffix && <span className="ml-0.5 text-base font-bold text-gray-800">{suffix}</span>}
        </div>
        {trend && (
          <Tag 
            color={isPositive ? "success" : isNegative ? "error" : "processing"}
            className="rounded-full px-2 py-0.5 font-bold border-0 ml-2"
            icon={isPositive ? <ArrowUpOutlined className="text-[10px]" /> : isNegative ? <ArrowDownOutlined className="text-[10px]" /> : null}
          >
            {trend}
          </Tag>
        )}
      </Flex>
      {detail && <Text type="secondary" className="block mt-2 font-medium text-xs">{detail}</Text>}
    </Card>
  );
}
